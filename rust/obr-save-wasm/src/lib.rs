use oozextract::Extractor;
use wasm_bindgen::prelude::*;

const MAX_SAVE_CHUNK_SIZE: usize = 128 * 1024;

#[wasm_bindgen]
pub fn decompress_save_chunk(input: &[u8], expected_size: usize) -> Result<Vec<u8>, JsError> {
    if expected_size == 0 || expected_size > MAX_SAVE_CHUNK_SIZE {
        return Err(JsError::new(&format!(
            "invalid save chunk output size {expected_size}; expected 1..={MAX_SAVE_CHUNK_SIZE}"
        )));
    }

    if input.len() < 2 {
        return Err(JsError::new("Oodle stream is shorter than its two-byte header"));
    }

    if input[0] != 0x8C || input[1] != 0x06 {
        return Err(JsError::new(&format!(
            "unsupported Oodle stream header {:02X}{:02X}; expected Kraken header 8C06",
            input[0], input[1]
        )));
    }

    let mut output = vec![0; expected_size];
    let written = Extractor::new()
        .read_from_slice(input, &mut output)
        .map_err(|error| JsError::new(&error.to_string()))?;

    if written != expected_size {
        return Err(JsError::new(&format!(
            "Kraken produced {written} bytes; expected {expected_size}"
        )));
    }

    Ok(output)
}
