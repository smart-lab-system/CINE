

class Solution {
    public List<Integer> frequencyCount(int[] arr) {
         Map<Integer, Integer> freqMap = new LinkedHashMap<>();
        
        for (int num : arr) {
            freqMap.put(num, freqMap.getOrDefault(num, 0) + 1);
        }

        List<Integer> result = new ArrayList<>();
        
        for (int num : arr) {
            if (freqMap.containsKey(num)) {
                result.add(freqMap.get(num));
                freqMap.remove(num); 
            }
        }

        return result;
    }
}