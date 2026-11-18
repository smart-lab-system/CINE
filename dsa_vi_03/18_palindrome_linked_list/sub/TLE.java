



/* Structure of class Node is
class Node
{
    int data;
    Node next;

    Node(int d)
    {
        data = d;
        next = null;
    }
}*/

class Solution {
    // Function to check whether the list is palindrome.
    static boolean isPalindrome(Node head) {
        // Your code here
        if(head==null||head.next==null)
        {
            return true;
        }
        Node mid=getMid(head);
        Node headsecond=reverse(mid);
        Node reversehead=headsecond;
        while(headsecond!=null)
        {
            if(head.data!=headsecond.data)
            {
                reverse(reversehead);
                return false;
            }
            head=head.next;
            headsecond=headsecond.next;
        }
        reverse(reversehead);
        return true;
    }
    static Node reverse(Node head)
    {
        if(head==null)
        {
            return head;
        }
        Node prev=null;
        Node present=head;
        Node next=present.next;
        while(present!=null)
        {
            present.next=prev;
            prev=present;
            present=next;
            if(next!=null)
            {
                next=next.next;
            }
        }
        return prev;
    }
    static Node getMid(Node head)
    {
        Node fast=head;
        Node slow=head;
        while(fast!=null&&fast.next!=null)
        {
            slow=slow.next;
            fast=fast.next.next;
        }
        return slow;
    }
}